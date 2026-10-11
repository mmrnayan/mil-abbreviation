"""Reconcile the curated data with the supplied Word authority.

Run with --write to apply the migration, or --check for a read-only source-row
audit. Only the three public/data JSON layers are written. The original Word
file is never modified. OOXML numbering is read separately from paragraph text.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
SOURCE = ROOT / "ABBREVIATIONS AND SYMBOLS.docx"
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
REVIEW_DATE = "2026-10-09"


def norm(value):
    return " ".join(value.split()).casefold()


def text(element):
    return "".join(part.text or "" for part in element.iter(W + "t"))


def cells(row):
    return [" ".join(text(p) for p in cell.findall(W + "p")).strip()
            for cell in row.findall(W + "tc")]


def location(block, row=None, **extra):
    result = {"document": SOURCE.name, "body_block": block + 1,
              "indexing": "one-based body block and table row", **extra}
    if row is not None:
        result["table_row"] = row + 1
    return result


def parse_xml(data: bytes):
    """Parse OOXML without resolving entities: DTDs are rejected outright, so
    entity-expansion (billion-laughs) payloads cannot run."""
    if b"<!DOCTYPE" in data or b"<!ENTITY" in data:
        raise ValueError("Unexpected DTD/entities in OOXML part; refusing to parse")
    return ET.fromstring(data)


def read_source():
    with zipfile.ZipFile(SOURCE) as archive:
        body = parse_xml(archive.read("word/document.xml")).find(W + "body")
        numbering = parse_xml(archive.read("word/numbering.xml"))
    return body, numbering


def source_rows(body):
    """Unambiguous table records; explicitly merged rows are audited separately."""
    annex = "A"
    starts = {518: "B", 553: "C", 726: "D", 746: "E",
              771: "F", 861: "G", 944: "H"}
    skipped = {(257, 37), (537, 12), (750, 21)}
    for block, element in enumerate(body):
        annex = starts.get(block, annex)
        if block > 1024:
            break
        if element.tag != W + "tbl":
            continue
        for row, record in enumerate(element.findall(W + "tr")):
            if (block, row) in skipped:
                continue
            values = [value for value in cells(record) if value.strip()]
            if annex == "D":
                values = [v for v in values if not re.fullmatch(r"16D-\d+", v)]
                pairs = list(zip(values[::2], values[1::2])) if len(values) in (2, 4) else []
            else:
                if annex == "A" and len(values) == 3 and re.fullmatch("[A-Z]", values[1]):
                    values = [values[0], values[2]]
                if len(values) != 2:
                    continue
                if annex == "B":
                    values.reverse()
                full, abbreviation = values
                full = re.sub(r"\s{2,}[A-Z]$", "", full).strip()
                full = re.sub(r"\s+b\. Sailors\.$", "", full).strip()
                if full in ("6.", "7.", "Name of Training Institute") or re.match(r"^16[A-H]-", full):
                    continue
                # These rows have independently stacked full forms and outputs.
                if annex == "G" and len(record.findall(W + "tc")[0].findall(W + "p")) > 1:
                    continue
                pairs = [(full, abbreviation)]
            for full, abbreviation in pairs:
                if full and abbreviation:
                    yield annex, block, row, " ".join(full.split()), " ".join(abbreviation.split())


def migrate(base, rules, overrides, body, numbering):
    entries = base["entries"]
    by_id = {entry["id"]: entry for entry in entries}
    removed = set()
    changes = []

    def repair(entry_id, full, abbreviation, block, row=None, **extra):
        entry = by_id.get(entry_id)
        if entry is None:
            return
        previous = (entry["full_form"], entry["abbreviation"])
        entry.update(full_form=full, abbreviation=abbreviation, verified=True,
                     source_location=location(block, row, **extra))
        if previous != (full, abbreviation):
            entry["source_repair"] = {"previous_full_form": previous[0],
                                      "previous_abbreviation": previous[1],
                                      "reviewed_on": REVIEW_DATE}
            changes.append(entry_id)

    next_number = max(int(entry["id"].split("-")[-1]) for entry in entries) + 1

    def add_pair(annex, full, abbreviation, block, row=None, service=None, **extra):
        nonlocal next_number
        existing = next((e for e in entries if e["id"] not in removed
                         and e["annex"] == annex and norm(e["full_form"]) == norm(full)
                         and e["abbreviation"] == abbreviation
                         and (service is None or e.get("service") == service)), None)
        if existing:
            if existing.get("source_location", {}).get("kind") == "service heading":
                existing["source_heading_location"] = existing["source_location"]
                existing["source_location"] = location(block, row, **extra)
            else:
                existing.setdefault("source_location", location(block, row, **extra))
            existing["verified"] = True
            return existing
        entry = {"id": f"abbr-{next_number:04d}", "full_form": full,
                 "abbreviation": abbreviation, "annex": annex,
                 "source": "Section 16", "verified": True,
                 "source_location": location(block, row, **extra)}
        if service is not None:
            entry["service"] = service
        if annex == "C":
            entry["subcategory"] = "appointment"
        entries.append(entry)
        by_id[entry["id"]] = entry
        changes.append(entry["id"])
        next_number += 1
        return entry

    # Restore full table cells before interpreting source notation.
    c_repairs = {
        "abbr-1810": (631, 0), "abbr-1811": (631, 1), "abbr-1846": (633, 24),
        "abbr-1875": (635, 15), "abbr-1891": (635, 31), "abbr-1980": (675, 11),
        "abbr-1982": (675, 13), "abbr-2003": (675, 34), "abbr-2013": (678, 9),
        "abbr-2014": (678, 10), "abbr-2015": (678, 11), "abbr-2021": (678, 17),
        "abbr-2174": (717, 32), "abbr-2180": (719, 2), "abbr-2181": (719, 3),
        "abbr-2186": (719, 8), "abbr-2194": (719, 16), "abbr-2197": (719, 19),
    }
    for entry_id, (block, row) in c_repairs.items():
        pair = [" ".join(value.split()) for value in cells(body[block].findall(W + "tr")[row]) if value.strip()]
        repair(entry_id, pair[0], pair[1], block, row)

    # The original extraction tagged all appointments as Air Force. Their source
    # section headings, not the vocabulary in their names, determine service.
    for entry in entries:
        number = int(entry["id"].split("-")[-1])
        if 1810 <= number <= 1944:
            entry["service"] = "army"
            entry.setdefault("source_location", location(629, kind="service heading"))
        elif 1945 <= number <= 2156:
            entry["service"] = "navy"
            entry.setdefault("source_location", location(649, kind="service heading"))
        elif 2157 <= number <= 2209:
            entry["service"] = "air-force"
        # The source's final appointments section is explicitly 'Others'.
        elif (entry["annex"] == "C" and entry.get("source_location", {}).get("body_block") == 722
              and entry.get("source_location", {}).get("table_row", 0) >= 5):
            entry["service"] = "other"

    removed.add("abbr-1794")  # A prose note is not an abbreviation pair.
    repair("abbr-0236", "Binocular", "Bino", 257, 37, reconstruction="two entries in merged row")
    add_pair("A", "Bir Bikram", "BB", 257, 37, reconstruction="two entries in merged row")
    repair("abbr-2341", "Bangladesh Institute of Peace Support Operation and Training", "BIPSOT", 750, 21)
    add_pair("E", "Bangladesh Infantry Regimental Centre", "BIRC", 750, 21, service="army")
    repair("abbr-1652", "Individual Training; Information Technology; Instructional Technique", "IT", 537, 13)
    repair("abbr-1651", "Identification Safety Range; Infantry Support Raft; Intelligence Surveillance and Reconnaissance", "ISR", 537, 12,
           reconstruction="wrapped Raft cell and displaced semicolon")
    repair("abbr-2467", "Bangladesh Navy Hydrographic and Oceanographic Centre", "BNHOC", 895)

    # Restore independent entries merged into ordinary Navy paragraphs.
    repair("abbr-2135", "Store Assistant", "SA", 708)
    repair("abbr-2136", "Radio Operator 2nd Class (General)", "RO(G) II", 709)
    add_pair("C", "Radio Operator 1st Class (General)", "RO(G) I", 708, service="navy")
    add_pair("C", "Topass", "TOP", 709, service="navy")
    repair("abbr-1802", "Squadron Leader", "Sqn Ldr", 610)
    add_pair("C", "Flight Lieutenant", "Flt Lt", 610, service="air-force")
    for block, full, abbreviation in [(613, "Officer Cadet", "Offr Cdt"),
                                       (617, "Master Warrant Officer", "MWO"),
                                       (618, "Senior Warrant Officer", "SWO"),
                                       (619, "Warrant Officer", "WO"),
                                       (620, "Sergeant", "Sgt"), (621, "Corporal", "Cpl")]:
        add_pair("C", full, abbreviation, block, service="air-force")
    repair("abbr-2119", "Principal Warfare Officer (Above)/(Communication)/(Navigation)/(Underwater)", "PWO/PWO(A/C/N/U)", 690,
           continuation_body_block=692)
    if "abbr-2119" in by_id:
        by_id["abbr-2119"]["service"] = "navy"
    removed.update(("abbr-2120", "abbr-2240"))

    repair("abbr-2431", "31 Supply & Transport Battalion", "31 ST Bn", 835, 1)

    # Correct the earlier malformed record and retire its reconstructed duplicate.
    ship_repairs = [
        ("BNS SALAM", "TUR", "SLM", 936, 13),
        ("BNS NISHAN", "81 PCS", "NSN", 936, 14),
        ("BNS KAPATAKHAYA", "91 PCS", "KPT", 936, 15),
        ("BNS KUSIYARA", "101 PCS", "KUS", 936, 16),
        ("BNS DORDANDA", "DDSA", "DNDA", 936, 18),
        ("BNFC BALABAN", "AUX", "BLBN", 939, 0),
        ("BNS DOLPHIN", "LCU", "DLPN", 939, 2),
        ("BNS SHAH MAKHDUM", "LCT", "SMKD", 939, 3),
        ("LANDING CRAFT TANK-100", "LCT-103", "LCT-100", 939, 4),
    ]
    for full, wrong, correct, block, row in ship_repairs:
        candidates = [e for e in entries if e["annex"] == "G" and e["full_form"] == full]
        if len(candidates) > 1:
            survivor = min(candidates, key=lambda e: e["id"])
            repair(survivor["id"], full, correct, block, row)
            removed.update(e["id"] for e in candidates if e["id"] != survivor["id"])

    # Optional source output notation denotes specific surfaces, not literal '(s)'.
    ref = by_id["abbr-1191"]
    ref.setdefault("source_full_form", "Refer/Reference(s)")
    ref.setdefault("source_abbreviation", "Ref(s)")
    ref_source = next((block, row) for annex, block, row, full, abbreviation in source_rows(body)
                      if full == "Refer/Reference(s)")
    repair("abbr-1191", "Refer", "Ref", *ref_source, source_rule="0241 plurals and verbs")
    add_pair("A", "Reference", "Ref", *ref_source, source_rule="0241 plurals", source_group="abbr-1191")
    add_pair("A", "References", "Refs", *ref_source, source_rule="0241 plurals", source_group="abbr-1191")
    vice = by_id["abbr-1491"]
    vice.setdefault("source_abbreviation", "V(title)")
    vice_source = next((block, row) for annex, block, row, full, abbreviation in source_rows(body)
                       if full == "Vice")
    repair("abbr-1491", "Vice", "V", *vice_source, source_rule="appointment prefix, Section 16")

    # Reconcile every unambiguous table record, including heading-adjacent rows
    # omitted by the earlier text extraction. Descriptor parentheses remain literal.
    for annex, block, row, full, abbreviation in source_rows(body):
        if full == "Refer/Reference(s)" or full == "Vice":
            continue
        service = None
        if annex == "C":
            service = ("navy" if block == 599 or 675 <= block <= 680 or (block == 717 and row < 14)
                       else "army" if 631 <= block <= 637
                       else "other" if block == 721 and row > 3
                       else "air-force")
        elif annex == "E":
            service = ("tri-service" if block == 750 and row < 11
                       else "army" if block == 750 and row < 34
                       else "navy" if block == 750 and row < 62 else "air-force")
        # Parenthesized F examples are prose wrappers around the authorized title.
        if annex == "F" and full.startswith("("):
            full, abbreviation = full.strip("()"), abbreviation.strip("()")
        if annex == "F" and full == "Remount Veterinary and Farm Corps":
            abbreviation = "RV&FC"
        add_pair(annex, full, abbreviation, block, row, service=service)

    # Verify reconstructed Navy cells against their independent paragraph lines.
    for block in (936, 939):
        for row, record in enumerate(body[block].findall(W + "tr")):
            record_cells = record.findall(W + "tc")
            full_forms = [text(p).strip() for p in record_cells[0].findall(W + "p") if text(p).strip()]
            abbreviations = [text(p).strip() for p in record_cells[-1].findall(W + "p") if text(p).strip()]
            if len(full_forms) != len(abbreviations):
                raise ValueError(f"Unpaired Navy row {block + 1}/{row + 1}")
            for index, (full, abbreviation) in enumerate(zip(full_forms, abbreviations)):
                if block == 939 and row == 11 and index > 0:
                    # Both independent numbered lists start at 314 in numbering.xml.
                    for number_id in ("15", "16"):
                        number = next(n for n in numbering.findall(W + "num") if n.get(W + "numId") == number_id)
                        abstract_id = number.find(W + "abstractNumId").get(W + "val")
                        abstract = next(a for a in numbering.findall(W + "abstractNum") if a.get(W + "abstractNumId") == abstract_id)
                        level = next(l for l in abstract.findall(W + "lvl") if l.get(W + "ilvl") == "0")
                        assert level.find(W + "start").get(W + "val") == "314"
                    full, abbreviation = f"{313 + index} {full}", f"{313 + index} {abbreviation}"
                add_pair("G", " ".join(full.split()), " ".join(abbreviation.split()), block, row,
                         paragraph_in_cell=index + 1)

    for entry_id, block in [("abbr-2524", 867), ("abbr-2525", 877), ("abbr-2526", 877),
                             ("abbr-2528", 897), ("abbr-2529", 897),
                             ("abbr-2632", 954), ("abbr-2633", 986)]:
        entry = by_id.get(entry_id)
        if entry:
            entry["verified"] = True
            entry["source_location"] = location(block, reconstruction="wrapped source paragraphs")

    add_pair("F", "19 East Bengal Regiment (Divisional Support)", "19 EB (Div Sp)", 821)
    add_pair("H", "Pilot", "GD(P)", 993)
    add_pair("H", "Navigators", "GD(N)", 994)
    for block, full, abbreviation in [(910, "7 Frigate Squadron", "7FS"),
                                       (915, "8 Frigate Squadron", "8 FS"),
                                       (917, "9 Frigate Squadron", "9 FS"),
                                       (920, "10 Small Frigate Guided Missile", "10 FSG"),
                                       (923, "11 Small Frigate Guided Missile", "11 FSG")]:
        add_pair("G", full, abbreviation, block, numbering="OOXML numId 12 level 1; starts at 7")

    annotate_paragraph_pairs(entries, body)

    # Remove accidental identical records after repair, keeping the oldest ID.
    unique = {}
    for entry in sorted(entries, key=lambda e: e["id"]):
        if entry["id"] in removed:
            continue
        key = (entry["annex"], entry.get("service"), norm(entry["full_form"]), entry["abbreviation"])
        if key in unique:
            removed.add(entry["id"])
        else:
            unique[key] = entry
    base["entries"] = entries = [e for e in entries if e["id"] not in removed]
    by_id = {e["id"]: e for e in entries}

    # Provenance distinguishes the source text from the normalized match surfaces.
    base["description"] = "Authorized Section 16 abbreviation pairs reconciled against the supplied Word document. Source repairs retain stable IDs and row provenance; grammatical match surfaces are declared separately."
    base["source"]["filename"] = SOURCE.name
    base["generated_on"] = REVIEW_DATE
    base["source"]["sha256"] = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    base["source"]["reviewed_on"] = REVIEW_DATE
    base["source"]["extraction"] = "OOXML paragraphs and table cells; automatic list numbering checked separately."
    base["source"]["retired_entry_ids"] = sorted(set(base["source"].get("retired_entry_ids", [])) | removed)
    base["source"]["retired_entry_ids"] = [entry_id for entry_id in base["source"]["retired_entry_ids"]
                                             if int(entry_id.split("-")[-1]) <= 2633]

    for entry in entries:
        if re.search(r"\(BN (?:Branch|only|Only)\)", entry["full_form"]):
            entry["service"] = "navy"

    variants, splits = normalized_surfaces(entries)

    # Rebuild normalization overrides with explicit entry IDs. Keep exact-form
    # exceptions and approved additions, and discard obsolete extraction patches.
    retained = []
    for record in overrides["overrides"]:
        if record["rule"] in ("correct_entry", "match_variants", "enable_forward", "split_entry"):
            continue
        if record["rule"] == "add_conversion" and record["input"] == "Arrangements":
            continue  # Covered by the approved arrange verb family below.
        if record["rule"] == "add_conversion":
            record.setdefault("entry_id", "custom-" + re.sub(r"[^a-z0-9]+", "-", record["input"].lower()).strip("-"))
        if record.get("entry_id") in removed:
            continue
        if record["rule"] == "exact_only" and not record.get("entry_id"):
            candidates = [e for e in entries if norm(e["full_form"]) == norm(record["input"]) and e["abbreviation"] == record["output"]]
            if len(candidates) == 1:
                record["entry_id"] = candidates[0]["id"]
        retained.append(record)
    for entry in entries:
        entry_id = entry["id"]
        if entry_id in splits:
            retained.append({"input": entry["full_form"], "output": entry["abbreviation"],
                             "rule": "split_entry", "entry_id": entry_id,
                             "parts": [{"full_form": f, "abbreviation": a} for f, a in splits[entry_id]],
                             "reason": "Source paired notation expanded into complete approved full forms and their corresponding abbreviations."})
        elif entry_id in variants:
            retained.append({"input": entry["full_form"], "output": entry["abbreviation"],
                             "rule": "match_variants", "entry_id": entry_id,
                             "match_variants": variants[entry_id],
                             "reason": "Explicit complete surface forms of the source notation; fragment matches are not authorized."})
            if entry["annex"] == "B":
                retained.append({"input": entry["full_form"], "output": entry["abbreviation"],
                                 "rule": "enable_forward", "entry_id": entry_id,
                                 "allowed_variants": variants[entry_id],
                                 "reason": "Exact approved full meanings may convert forward; reverse expansion remains a contextual choice."})
    overrides["overrides"] = retained
    overrides["description"] = "Explicit authorized source surfaces, paired notation, exact-form exceptions and reviewer-approved additions. Extraction repairs are recorded in the authoritative dictionary with provenance."

    custom_entries = [{"id": record["entry_id"], "full_form": record["input"],
                       "abbreviation": record["output"]} for record in retained if record["rule"] == "add_conversion"]
    repair_rules(rules, entries + custom_entries, variants, splits)
    return {"entry_count": len(entries), "repaired_or_added_ids": sorted(set(changes)),
            "retired_ids": sorted(removed), "normalization_overrides": len(retained)}


# Shared stems/suffixes are declared here rather than guessed by the converter.
SHARED = {
    "Air Defence/Despatch": ["Air Defence", "Air Despatch"],
    "General Service Training Pamphlet/Publication": ["General Service Training Pamphlet", "General Service Training Publication"],
    "Humanitarian Assistance and Disaster Relief/Response": ["Humanitarian Assistance and Disaster Relief", "Humanitarian Assistance and Disaster Response"],
    "Letter of Assist/Acceptance": ["Letter of Assist", "Letter of Acceptance"],
    "Letter of Intent/Interest": ["Letter of Intent", "Letter of Interest"],
    "Operational Sea Training Group/Guide": ["Operational Sea Training Group", "Operational Sea Training Guide"],
    "Over Head Protection/Projector": ["Over Head Protection", "Over Head Projector"],
    "Sector/Squadron Headquarters": ["Sector Headquarters", "Squadron Headquarters"],
    "Battalion/Battery Quarter Master Sergeant": ["Battalion Quarter Master Sergeant", "Battery Quarter Master Sergeant"],
    "Battalion/Battery Sergeant Major": ["Battalion Sergeant Major", "Battery Sergeant Major"],
    "Chief Engineer/Evaluator": ["Chief Engineer", "Chief Evaluator"],
    "Military Adviser/Attaché/Assistant": ["Military Adviser", "Military Attaché", "Military Assistant"],
    "Armoured/Artillery Officers Basic Course": ["Armoured Officers Basic Course", "Artillery Officers Basic Course"],
    "Bring/Brought Forward": ["Bring Forward", "Brought Forward"],
    "Casualty Collection Point/Post": ["Casualty Collection Point", "Casualty Collection Post"],
    "Certificate/Certified Issue Voucher": ["Certificate Issue Voucher", "Certified Issue Voucher"],
    "Commander Land Forces/Landing Force": ["Commander Land Forces", "Commander Landing Force"],
    "Certificate/Certified Receipt Voucher": ["Certificate Receipt Voucher", "Certified Receipt Voucher"],
    "Electronic Warfare Control Ship/Station": ["Electronic Warfare Control Ship", "Electronic Warfare Control Station"],
    "Fighter Control/Controller": ["Fighter Control", "Fighter Controller"],
    "Field Firing/ Frigate": ["Field Firing", "Frigate"],
    "Fire/Free Flight Rocket": ["Fire Flight Rocket", "Free Flight Rocket"],
    "Field/Formation Training Exercise": ["Field Training Exercise", "Formation Training Exercise"],
    "Field Security/Service": ["Field Security", "Field Service"],
    "General Air Picture/Plot": ["General Air Picture", "General Air Plot"],
    "Local Air Picture/Plot": ["Local Air Picture", "Local Air Plot"],
    "Landing Craft Mechanized/Medium": ["Landing Craft Mechanized", "Landing Craft Medium"],
    "Master/Mixer Control Unit": ["Master Control Unit", "Mixer Control Unit"],
    "Mechanical/ Motor Transport": ["Mechanical Transport", "Motor Transport"],
    "Military Assistant/Attaché": ["Military Assistant", "Military Attaché"],
    "Mobile/Mortar Fire Controller": ["Mobile Fire Controller", "Mortar Fire Controller"],
    "Operational Control/ Conversion Unit": ["Operational Control Unit", "Operational Conversion Unit"],
    "Over Head Protector/Projection": ["Over Head Protector", "Over Head Projection"],
    "One Time Process/Pad": ["One Time Process", "One Time Pad"],
    "Photographic Interpretation/interpreter": ["Photographic Interpretation", "Photographic Interpreter"],
    "Radio Telephone/Telephony": ["Radio Telephone", "Radio Telephony"],
    "Record/Retired Officer": ["Record Officer", "Retired Officer"],
    "Rest and Refit/Recuperation": ["Rest and Refit", "Rest and Recuperation"],
    "Station Supply/Stores Depot": ["Station Supply Depot", "Station Stores Depot"],
    "Surface Picture/Plot": ["Surface Picture", "Surface Plot"],
    "Unit Entitlement/Establishment": ["Unit Entitlement", "Unit Establishment"],
    "Vehicle Check/Collecting Point": ["Vehicle Check Point", "Vehicle Collecting Point"],
    "Combat/Command Vehicle": ["Combat Vehicle", "Command Vehicle"],
    "Quick Reaction/Response Force": ["Quick Reaction Force", "Quick Response Force"],
}

SPECIAL_VARIANTS = {
    "abbr-0066": ["Airborne Warning and Control", "Airborne Warning and Control System"],
    "abbr-0142": ["Army Regulations (Regulations)", "Army Regulations (Instructions)"],
    "abbr-0157": ["Assault Ship", "Landing Platform Dock", "Assault Ship (Landing Platform Dock)"],
    "abbr-0473": ["Divide", "Divided", "Division"],
    "abbr-0639": ["Friendly Aircraft Movement", "Friendly Aircraft Movement (net)"],
    "abbr-0500": ["Electronic Support Measure", "Electronic Warfare Support Measure"],
    "abbr-0825": ["Landing Platform Dock", "Assault Ship", "Landing Platform Dock (Assault Ship)"],
    "abbr-0869": ["Logistic", "Logistical", "Logistics"],
    "abbr-0939": ["Memorandum of Understanding", "Memorandums of Understanding", "Memoranda of Understanding"],
    "abbr-0914": ["Maritime", "Master"],
    "abbr-1182": ["Receive", "Received"],
    "abbr-1428": ["Tradesman", "Tradesmen"],
    "abbr-1558": ["Amplitude Modulated", "Amplitude Modulation"],
    "abbr-1628": ["Frequency Modulated", "Frequency Modulation"],
    "abbr-1722": ["Section", "Sector", "Sectoral", "Second"],
    "abbr-1739": ["Telegram", "Telegraph", "Telegraphic", "Telegraphist", "Telegraphy"],
    "abbr-1740": ["Thermal Imager", "Thermal Imagery", "Thermal Imaging"],
    "abbr-1750": ["Week", "Weekly", "Work"],
    "abbr-1576": ["Building"],  # Paragraph 0241 exception outranks Annex B's Build.
}


def suffix_variants(value):
    """Expand optional suffix notation; retain long descriptive parentheses."""
    suffixes = re.findall(r"\(([a-z/]{1,20})\)", value)
    if not suffixes:
        return [value.strip()]
    first = re.search(r"\(([a-z/]{1,20})\)", value)
    prefix = value[:first.start()].rstrip()
    tail = re.sub(r"\(([a-z/]{1,20})\)", "", value[first.end():]).strip()
    values = [prefix] + [(prefix[:-1] if suffix == "ing" and prefix.endswith("e") else prefix) + suffix
                         for group in suffixes for suffix in group.split("/")]
    return [v + (" " + tail if tail else "") for v in values]


def meaning_variants(value):
    if value in SHARED:
        return SHARED[value]
    pieces, current, depth = [], "", 0
    for character in value:
        depth += character == "("
        depth -= character == ")"
        if character == "/" and depth == 0:
            pieces.append(current.strip())
            current = ""
        else:
            current += character
    pieces.append(current.strip())
    return [surface for piece in pieces for surface in suffix_variants(piece)]


def normalized_surfaces(entries):
    splits = {
        "abbr-0059": [("Air to Air Missile", "AAM"), ("Air to Air Guided Missile", "AAGM"), ("Air to Air Guided Weapon", "AAGW")],
        "abbr-0142": [("Army Regulations", "AR (R)"), ("Army Instructions", "AR (I)"), ("Army Regulations (Regulations)", "AR (R)"), ("Army Regulations (Instructions)", "AR (I)")],
        "abbr-0325": [("Combat Vehicle Reconnaissance (Tracked)", "CVR(T)"), ("Combat Vehicle Reconnaissance (Wheeled)", "CVR(W)")],
        "abbr-0342": [("Commander Task Element", "CTE"), ("Commander Task Force", "CTF"), ("Commander Task Group", "CTG"), ("Commander Task Unit", "CTU")],
        "abbr-0444": [("Destroyer", "DD"), ("Destroyer (Guided)", "DD(G)")],
        "abbr-0641": [("Frigate", "FF"), ("Frigate (Guided)", "FF(G)")],
        "abbr-0822": [("Landing Craft Tank", "LCT"), ("Landing Craft Utility", "LCU")],
        "abbr-1274": [("Short Take-off and Landing", "STOL"), ("Vertical Take-off and Landing", "VTOL")],
        "abbr-1385": [("Tactical Air Support of Land Operations", "TASLO"), ("Tactical Air Support of Maritime Operations", "TASMO")],
        "abbr-1368": [("Surveillance and Target Acquisition", "STA"), ("Surveillance and Target Acquisition Plan", "STA(P)"), ("Surveillance and Target Acquisition (Plan)", "STA(P)")],
        "abbr-1450": [("Unarmed Aerial System", "UAS"), ("Unmanned Aerial System", "UAS"), ("Unarmed Aerial Vehicle", "UAV"), ("Unmanned Aerial Vehicle", "UAV")],
        "abbr-1484": [("Vertical Take-off and Landing", "VTOL"), ("Short Take-off and Landing", "STOL")],
        "abbr-1487": [("Very Important Person", "VIP"), ("Very Very Important Person", "VVIP")],
        "abbr-1616": [("Estimated Time of Arrival", "ETA"), ("Estimated Time of Completion", "ETC"), ("Estimated Time of Departure", "ETD"), ("Estimated Time of Return", "ETR")],
        "abbr-1735": [("Task Element", "TE"), ("Task Force", "TF"), ("Task Group", "TG"), ("Task Unit", "TU")],
        "abbr-2347": [("Non Commission Officer’s Academy", "NCOA"), ("JCO-NCO Academy", "JNA")],
        "abbr-2119": [("Principal Warfare Officer", "PWO"), ("Principal Warfare Officer (Above)", "PWO(A)"), ("Principal Warfare Officer (Communication)", "PWO(C)"), ("Principal Warfare Officer (Navigation)", "PWO(N)"), ("Principal Warfare Officer (Underwater)", "PWO(U)")],
        "abbr-2197": [("Director of Cyber Warfare and Information Technology", "D CW&IT"), ("Directorate of Cyber Warfare and Information Technology", "Dte CW&IT")],
    }
    variants = {}
    for entry in entries:
        entry_id, full, abbreviation = entry["id"], entry["full_form"], entry["abbreviation"]
        if "Director (Directorate)" in full:
            if "/" in abbreviation:
                director, directorate = [a.strip() for a in abbreviation.split("/", 1)]
                splits[entry_id] = [(full.replace("Director (Directorate)", "Director"), director),
                                    (full.replace("Director (Directorate)", "Directorate"), directorate)]
            else:
                variants[entry_id] = [full.replace("Director (Directorate)", "Director"),
                                      full.replace("Director (Directorate)", "Directorate")]
            continue
        if entry_id in splits:
            continue
        if entry_id in SPECIAL_VARIANTS:
            values = SPECIAL_VARIANTS[entry_id]
        elif full == "Unarmed/Unmanned Combat Aerial Vehicle":
            values = ["Unarmed Combat Aerial Vehicle", "Unmanned Combat Aerial Vehicle"]
        elif entry["annex"] == "B" or any(c in full for c in "/;("):
            values = [v for meaning in full.split(";") for v in meaning_variants(meaning.strip())]
        else:
            continue
        if entry_id == "abbr-0334":
            values.append(re.sub(r"\s*\((?:C2|ISR)\)", "", full))
        # Context labels identify a word rather than forming an optional suffix.
        for surface in list(values):
            if re.search(r"\((?:BN [Bb]ranch|BN [Oo]nly|air traffic|time of|titles etc\.|when used in conjunction with other words)\)", surface):
                values.append(re.sub(r"\([^)]*\)", "", surface).strip())
        variants[entry_id] = list(dict.fromkeys(" ".join(v.split()) for v in values if v.strip()))
    return variants, splits


def verb_forms(root):
    third = root + "s"
    if re.search(r"[^aeiou]y$", root):
        third = root[:-1] + "ies"
    elif re.search(r"(?:s|sh|ch|x|z|o)$", root):
        third = root + "es"
    if root in {"control", "patrol", "propel", "refer"}:
        past, progressive = root + root[-1] + "ed", root + root[-1] + "ing"
    elif root.endswith("e"):
        past, progressive = root + "d", root[:-1] + "ing"
    elif re.search(r"[^aeiou]y$", root):
        past, progressive = root[:-1] + "ied", root + "ing"
    else:
        past, progressive = root + "ed", root + "ing"
    forms = [root, third, past, progressive]
    if root == "speak":
        forms = [root, third, "spoke", "spoken", progressive]
    elif root == "withdraw":
        forms = [root, third, "withdrew", "withdrawn", progressive]
    return forms


def repair_rules(rules, entries, variants, splits):
    by_id = {entry["id"]: entry for entry in entries}
    if not any(rule["root"] == "command" for rule in rules["rules"]):
        rules["rules"].append({"root": "command", "abbreviation": "comd", "part_of_speech": "verb",
                               "allowed_rules": ["verb_forms", "compound_suffix"],
                               "examples": {}, "entry_id": "abbr-0330"})
    if not any(rule["root"] == "deployment" for rule in rules["rules"]):
        rules["rules"].append({"root": "deployment", "abbreviation": "depl", "part_of_speech": "noun",
                               "allowed_rules": ["plural_invariant"],
                               "examples": {"deployment": "depl", "deployments": "depl"},
                               "entry_id": "custom-deployment"})
    for rule in rules["rules"]:
        root, abbreviation = rule["root"], rule["abbreviation"]
        if root == "refer":
            abbreviation = rule["abbreviation"] = "Ref"
            rule["entry_id"] = "abbr-1191"
        if root in ("answer", "refer", "command"):
            rule["part_of_speech"] = "verb"
            rule["allowed_rules"] = ["verb_forms", "compound_suffix"]
        if rule.get("entry_id") == "abbr-1776":
            rule["part_of_speech"] = "noun"
            rule["allowed_rules"] = ["noun_plural"]
            rule["examples"] = {"recruit": "Rect", "recruits": "Rects"}
        if not rule.get("entry_id"):
            matches = [e for e in entries if e["abbreviation"] == abbreviation
                       and (norm(root) in {norm(v) for v in variants.get(e["id"], [e["full_form"]])}
                            or norm(re.sub(r"\([^)]*\)", "", e["full_form"]).split("/")[0].split(";")[0]) == norm(root))]
            if not matches:
                raise ValueError(f"Rule {root} -> {abbreviation} has no authoritative target")
            rule["entry_id"] = min(matches, key=lambda e: e["id"])["id"]
        if rule["entry_id"] not in by_id:
            raise ValueError(f"Rule target retired: {rule['entry_id']}")
        if rule["part_of_speech"] == "verb":
            rule["allowed_rules"] = list(dict.fromkeys(rule["allowed_rules"] + ["compound_prefix"]))
            rule["examples"] = dict.fromkeys(verb_forms(root), abbreviation)
            if root == "support":
                rule["examples"].update(dict.fromkeys(["supporter", "supporters", "supportive"], abbreviation))
            if root == "deploy":
                rule["examples"].update(dict.fromkeys(["deployment", "deployments"], abbreviation))
            if root == "arrange":
                rule["examples"].update(dict.fromkeys(["arrangement", "arrangements"], abbreviation))
        else:
            rule["examples"] = {word: output for word, output in rule["examples"].items()
                                if not word.endswith("ship") and word not in ("logisticses", "article in uses", "memorandum of understandings", "vehicle off the roads", "line of communications")}
            corrected_plurals = {"article in use": ["articles in use"],
                                 "memorandum of understanding": ["memorandums of understanding", "memoranda of understanding"],
                                 "vehicle off the road": ["vehicles off the road"],
                                 "line of communication": ["lines of communication"],
                                 "logistics": ["logistic", "logistical"]}
            rule["examples"].update(dict.fromkeys(corrected_plurals.get(root, []), abbreviation))
        rule["source_rule"] = ("Reviewer-approved exact conversion; plural treatment follows 0241"
                               if rule["entry_id"].startswith("custom-") else "0241 plurals and verbs")
    rules["description"] = "Paragraph 0241 grammatical behavior. Root rules bind to authoritative entry IDs; examples are approved complete surface forms. Specific printed derivatives remain exact-form exceptions."
    rules["default_behaviour"]["allowed_rules"] = ["noun_plural", "compound_prefix", "compound_suffix"]
    rules["global"]["irregular_forms"]["memoranda"] = "memorandum"
    morphology = rules["global"]["engine_config"]["morphology"]
    morphology["policy"] = "controlled_authorized_roots"
    morphology["rule"] = "Apply declared examples and controlled grammatical rules only to authorized dictionary roots, respecting exact-form exceptions and complete word boundaries. Paragraph 0241 authorizes verb derivatives and composed forms; specific published exceptions take precedence."


def annotate_paragraph_pairs(entries, body):
    """Trace the dictionary pairs printed in paragraphs instead of tables."""
    compact = lambda value: re.sub(r"[^a-z0-9]", "", value.casefold())
    paragraphs = [(block, element, compact(text(element)))
                  for block, element in enumerate(body)
                  if element.tag == W + "p" and 131 <= block <= 1024]
    for entry in entries:
        if "source_location" in entry:
            continue
        full = entry.get("source_full_form", entry["full_form"])
        abbreviation = entry.get("source_abbreviation", entry["abbreviation"])
        needle = compact(full + abbreviation)
        hits = [(block, element) for block, element, paragraph in paragraphs if needle in paragraph]
        numbered = False
        if not hits and re.match(r"^\d+ ", full) and re.match(r"^\d+ ", abbreviation):
            # The full-form number is automatic; the abbreviation prints it.
            needle = compact(re.sub(r"^\d+ ", "", full) + abbreviation)
            hits = [(block, element) for block, element, paragraph in paragraphs
                    if needle in paragraph and element.find(".//" + W + "numPr") is not None]
            numbered = True
        if hits:
            block, element = hits[0]
            extra = {"kind": "printed paragraph pair", "comparison": "case, punctuation and whitespace normalized"}
            if numbered:
                num = element.find(".//" + W + "numPr")
                extra["numbering"] = "OOXML automatic list prefix; recorded unit number retained"
                extra["numbering_properties"] = {child.tag.removeprefix(W): child.get(W + "val") for child in num}
            entry["source_location"] = location(block, **extra)


def check_source_rows(base, body):
    index = {(entry["annex"], norm(entry.get("source_full_form", entry["full_form"])),
              norm(entry.get("source_abbreviation", entry["abbreviation"]))) for entry in base["entries"]}
    missing = []
    count = 0
    for annex, block, row, full, abbreviation in source_rows(body):
        count += 1
        if annex == "F" and full.startswith("("):
            full, abbreviation = full.strip("()"), abbreviation.strip("()")
        if annex == "F" and full == "Remount Veterinary and Farm Corps":
            abbreviation = "RV&FC"
        if (annex, norm(full), norm(abbreviation)) not in index:
            missing.append({"annex": annex, "body_block": block + 1, "table_row": row + 1,
                            "full_form": full, "abbreviation": abbreviation})
    return {"unambiguous_table_pairs_checked": count, "missing_source_pairs": missing}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    paths = [DATA / name for name in ("abbreviations.base.json", "abbreviation-rules.json", "abbreviation-overrides.json")]
    layers = [json.loads(path.read_text(encoding="utf-8-sig")) for path in paths]
    body, numbering = read_source()
    result = {}
    if args.write:
        result = migrate(*layers, body, numbering)
        for path, layer in zip(paths, layers):
            path.write_text(json.dumps(layer, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    result.update(check_source_rows(layers[0], body))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["missing_source_pairs"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
