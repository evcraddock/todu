import os from "node:os";
import path from "node:path";

/** Default base directory for todu data */
export const DEFAULT_DATA_DIR = path.join(os.homedir(), ".todu", "data");

/** Default config file path */
export const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".todu", "config.yaml");

/** Automerge document ID for the catalog (stable, well-known) */
export const CATALOG_DOC_KEY = "todu-catalog";
