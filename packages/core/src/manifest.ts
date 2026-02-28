/**
 * Manifest management for MarkdownX
 * Handles version control, compatibility checks, and feature flags
 */
import type { Manifest, ManifestValidationResult } from './types';

/** Current format version of the document structure */
export const CURRENT_FORMAT_VERSION = 1;

/** Minimum reader version required to read documents created by this app */
export const CURRENT_MIN_READER_VERSION = 1;

/** Current app version for compatibility checks */
export const APP_VERSION = 1;

/**
 * Create a default manifest for new documents
 */
export function createDefaultManifest(): Manifest {
  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    minReaderVersion: CURRENT_MIN_READER_VERSION,
    features: [],
  };
}

/**
 * Validate a manifest against the current app version
 * 
 * @param manifest - The manifest to validate
 * @param appVersion - Current app version (defaults to APP_VERSION)
 * @returns Validation result:
 *   - 'ok': Full read/write access
 *   - 'read-only': Can read but not write (newer format version)
 *   - 'blocked': Cannot read (app too old)
 */
export function validateManifest(
  manifest: Manifest,
  appVersion: number = APP_VERSION
): ManifestValidationResult {
  // If the document requires a newer reader than we have, we can't read it
  if (manifest.minReaderVersion > appVersion) {
    return 'blocked';
  }

  // If the document has a newer format version than we understand,
  // we can read it but shouldn't write (to avoid corrupting unknown features)
  if (manifest.formatVersion > CURRENT_FORMAT_VERSION) {
    return 'read-only';
  }

  return 'ok';
}

/**
 * Check if a feature is enabled in the manifest
 */
export function hasFeature(manifest: Manifest, feature: string): boolean {
  return manifest.features.includes(feature);
}

/**
 * Add a feature to the manifest
 */
export function addFeature(manifest: Manifest, feature: string): Manifest {
  if (!manifest.features.includes(feature)) {
    return {
      ...manifest,
      features: [...manifest.features, feature],
    };
  }
  return manifest;
}

/**
 * Upgrade an old manifest to the current format version
 * This is called when opening older documents
 */
export function upgradeManifest(manifest: Manifest): Manifest {
  let upgraded = { ...manifest };

  // Upgrade from version 0 to 1
  if (upgraded.formatVersion < 1) {
    upgraded.formatVersion = 1;
    // Ensure minReaderVersion is set
    if (!upgraded.minReaderVersion) {
      upgraded.minReaderVersion = 1;
    }
  }

  // Future upgrades go here
  // if (upgraded.formatVersion < 2) { ... }

  return upgraded;
}

/**
 * Serialize manifest to JSON string
 */
export function serializeManifest(manifest: Manifest): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * Parse manifest from JSON string
 * Validates required fields and provides defaults for missing optional fields
 */
export function parseManifest(json: string): Manifest {
  const parsed = JSON.parse(json) as Partial<Manifest>;

  // Validate required fields
  if (typeof parsed.formatVersion !== 'number') {
    throw new Error('Manifest missing required field: formatVersion');
  }

  return {
    formatVersion: parsed.formatVersion,
    minReaderVersion: parsed.minReaderVersion ?? parsed.formatVersion,
    features: parsed.features ?? [],
    aiMetadata: parsed.aiMetadata,
  };
}

/**
 * Get a human-readable description of validation result
 */
export function getValidationMessage(result: ManifestValidationResult): string {
  switch (result) {
    case 'ok':
      return 'Document is fully compatible';
    case 'read-only':
      return 'Document was created by a newer app version. Opening in read-only mode.';
    case 'blocked':
      return 'Document requires a newer app version. Please update the app to open this file.';
    default:
      return 'Unknown validation result';
  }
}
