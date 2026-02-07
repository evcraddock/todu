import path from "node:path";

/** Default base directory for todu data (relative to cwd) */
export const DEFAULT_DATA_DIR = path.join(".todu", "data");

/** Default config file path (relative to cwd) */
export const DEFAULT_CONFIG_PATH = path.join(".todu", "config.yaml");

/** Automerge document ID for the catalog (stable, well-known) */
export const CATALOG_DOC_KEY = "todu-catalog";
