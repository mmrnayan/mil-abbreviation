"use client";

import { useEffect } from "react";

export function OfficePaneMode() {
  useEffect(() => {
    if (window.Office) document.body.classList.add("office-pane");
    return () => document.body.classList.remove("office-pane");
  }, []);
  return null;
}
