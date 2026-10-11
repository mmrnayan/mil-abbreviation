import { normalizeForMatch } from "./phraseTrie";
import type {
  AbbreviationDataset,
  DatasetValidationResult,
  ValidationDiagnostic,
} from "./types";

export const SUPPORTED_SCHEMA_VERSION = "1.1.0";
const VALID_ANNEX_IDS = new Set(["A", "B", "C", "D", "E", "F", "G", "H"]);
const VALID_SERVICES = new Set([
  "tri-service",
  "army",
  "navy",
  "air-force",
  "other",
]);

const REQUIRED_ENTRY_PROPERTIES = [
  "id",
  "full_form",
  "abbreviation",
  "annex",
  "category",
  "service",
  "ambiguous",
  "meanings",
  "aliases",
  "match_variants",
  "conversion_enabled",
  "match",
  "quality",
] as const;

function objectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function add(
  diagnostics: ValidationDiagnostic[],
  severity: ValidationDiagnostic["severity"],
  code: string,
  message: string,
  path?: string,
): void {
  diagnostics.push({ severity, code, message, path });
}

export function validateDataset(value: unknown): DatasetValidationResult {
  const diagnostics: ValidationDiagnostic[] = [];
  const checkedAt = new Date().toISOString();

  if (!objectLike(value)) {
    add(diagnostics, "error", "DATASET_NOT_OBJECT", "The dataset root must be a JSON object.");
    return { valid: false, entryCount: 0, diagnostics, checkedAt };
  }

  const requiredRootProperties = [
    "schema_version",
    "annexes",
    "converter_config",
    "entries",
    "conflicts",
  ];
  for (const property of requiredRootProperties) {
    if (!(property in value)) {
      add(
        diagnostics,
        "error",
        "MISSING_ROOT_PROPERTY",
        `Required root property “${property}” is missing.`,
        property,
      );
    }
  }

  const schemaVersion =
    typeof value.schema_version === "string" ? value.schema_version : undefined;
  if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    add(
      diagnostics,
      "error",
      "UNSUPPORTED_SCHEMA_VERSION",
      `Expected schema ${SUPPORTED_SCHEMA_VERSION}, received ${schemaVersion ?? "no version"}.`,
      "schema_version",
    );
  }

  const annexes = Array.isArray(value.annexes) ? value.annexes : [];
  const declaredAnnexes = new Set<string>();
  annexes.forEach((annex, index) => {
    if (!objectLike(annex) || typeof annex.id !== "string" || !VALID_ANNEX_IDS.has(annex.id)) {
      add(
        diagnostics,
        "error",
        "INVALID_ANNEX_DEFINITION",
        `Annex definition ${index + 1} has an invalid ID.`,
        `annexes[${index}]`,
      );
      return;
    }
    if (declaredAnnexes.has(annex.id)) {
      add(
        diagnostics,
        "error",
        "DUPLICATE_ANNEX",
        `Annex ${annex.id} is declared more than once.`,
        `annexes[${index}].id`,
      );
    }
    declaredAnnexes.add(annex.id);
  });

  const entries = Array.isArray(value.entries) ? value.entries : [];
  if (!Array.isArray(value.entries)) {
    add(diagnostics, "error", "INVALID_ENTRIES", "The entries property must be an array.", "entries");
  }

  const entryIds = new Set<string>();
  let mediumConfidenceCount = 0;

  entries.forEach((entry, index) => {
    const path = `entries[${index}]`;
    if (!objectLike(entry)) {
      add(diagnostics, "error", "INVALID_ENTRY", "Entry must be an object.", path);
      return;
    }

    for (const property of REQUIRED_ENTRY_PROPERTIES) {
      if (!(property in entry)) {
        add(
          diagnostics,
          "error",
          "MISSING_ENTRY_PROPERTY",
          `Entry is missing required property “${property}”.`,
          `${path}.${property}`,
        );
      }
    }

    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id) {
      add(diagnostics, "error", "EMPTY_ENTRY_ID", "Entry ID cannot be empty.", `${path}.id`);
    } else if (entryIds.has(id)) {
      add(diagnostics, "error", "DUPLICATE_ENTRY_ID", `Entry ID “${id}” is not unique.`, `${path}.id`);
    } else {
      entryIds.add(id);
    }

    if (typeof entry.full_form !== "string" || !entry.full_form.trim()) {
      add(diagnostics, "error", "EMPTY_FULL_FORM", "Full form cannot be empty.", `${path}.full_form`);
    }
    if (typeof entry.abbreviation !== "string" || !entry.abbreviation.trim()) {
      add(diagnostics, "error", "EMPTY_ABBREVIATION", "Abbreviation cannot be empty.", `${path}.abbreviation`);
    }
    if (typeof entry.annex !== "string" || !declaredAnnexes.has(entry.annex)) {
      add(
        diagnostics,
        "error",
        "INVALID_ENTRY_ANNEX",
        `Entry “${id || index}” references an undeclared annex.`,
        `${path}.annex`,
      );
    }
    if (typeof entry.service !== "string" || !VALID_SERVICES.has(entry.service)) {
      add(
        diagnostics,
        "error",
        "INVALID_ENTRY_SERVICE",
        `Entry “${id || index}” has an invalid service.`,
        `${path}.service`,
      );
    }

    if (!Array.isArray(entry.match_variants) || entry.match_variants.length === 0) {
      add(
        diagnostics,
        "error",
        "EMPTY_MATCH_VARIANTS",
        `Entry “${id || index}” must have at least one match variant.`,
        `${path}.match_variants`,
      );
    } else {
      const variants = new Set<string>();
      entry.match_variants.forEach((variant, variantIndex) => {
        if (typeof variant !== "string" || !variant.trim()) {
          add(
            diagnostics,
            "error",
            "INVALID_MATCH_VARIANT",
            `Entry “${id || index}” contains an empty match variant.`,
            `${path}.match_variants[${variantIndex}]`,
          );
          return;
        }
        const key = normalizeForMatch(variant).trim();
        if (variants.has(key)) {
          add(
            diagnostics,
            "error",
            "DUPLICATE_MATCH_VARIANT",
            `Entry “${id || index}” repeats match variant “${variant}”.`,
            `${path}.match_variants[${variantIndex}]`,
          );
        }
        variants.add(key);
      });
    }

    if (
      objectLike(entry.quality) &&
      entry.quality.confidence === "medium"
    ) {
      mediumConfidenceCount += 1;
    }
  });

  const config = objectLike(value.converter_config) ? value.converter_config : undefined;
  const replacementIds = config?.replacement_entry_ids;
  if (!Array.isArray(replacementIds)) {
    add(
      diagnostics,
      "error",
      "INVALID_REPLACEMENT_IDS",
      "converter_config.replacement_entry_ids must be an array.",
      "converter_config.replacement_entry_ids",
    );
  } else {
    replacementIds.forEach((id, index) => {
      if (typeof id !== "string" || !entryIds.has(id)) {
        add(
          diagnostics,
          "error",
          "UNKNOWN_REPLACEMENT_ENTRY_ID",
          `Replacement entry ID “${String(id)}” does not reference an entry.`,
          `converter_config.replacement_entry_ids[${index}]`,
        );
      }
    });
  }

  const conflicts = Array.isArray(value.conflicts) ? value.conflicts : [];
  if (!Array.isArray(value.conflicts)) {
    add(diagnostics, "error", "INVALID_CONFLICTS", "The conflicts property must be an array.", "conflicts");
  }
  conflicts.forEach((conflict, conflictIndex) => {
    if (!objectLike(conflict) || !Array.isArray(conflict.entry_ids)) {
      add(
        diagnostics,
        "error",
        "INVALID_CONFLICT",
        "Conflict record must contain entry_ids.",
        `conflicts[${conflictIndex}]`,
      );
      return;
    }
    conflict.entry_ids.forEach((id, idIndex) => {
      if (typeof id !== "string" || !entryIds.has(id)) {
        add(
          diagnostics,
          "error",
          "UNKNOWN_CONFLICT_ENTRY_ID",
          `Conflict entry ID “${String(id)}” does not reference an entry.`,
          `conflicts[${conflictIndex}].entry_ids[${idIndex}]`,
        );
      }
    });
  });

  if (objectLike(value.statistics) && typeof value.statistics.entry_count === "number" && value.statistics.entry_count !== entries.length) {
    add(
      diagnostics,
      "warning",
      "STATISTIC_ENTRY_COUNT_MISMATCH",
      `Statistics report ${value.statistics.entry_count} entries, but ${entries.length} were loaded.`,
      "statistics.entry_count",
    );
  }

  if (mediumConfidenceCount > 0) {
    add(
      diagnostics,
      "warning",
      "MEDIUM_CONFIDENCE_RECORDS",
      `${mediumConfidenceCount} records are marked medium confidence and remain available with verification indicators.`,
      "entries",
    );
  }

  return {
    valid: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    schemaVersion,
    entryCount: entries.length,
    diagnostics,
    checkedAt,
  };
}

export function assertValidDataset(value: unknown): AbbreviationDataset {
  const result = validateDataset(value);
  if (!result.valid) {
    const message = result.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.message)
      .join("\n");
    throw new Error(`Dataset validation failed:\n${message}`);
  }
  return value as AbbreviationDataset;
}
