import pkg from "../package.json";

/** App version — single source of truth is package.json ("version"). */
export const APP_VERSION: string = pkg.version;
