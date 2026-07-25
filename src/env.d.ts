/// <reference types="astro/client" />

interface ImportMetaEnv {
    // Build-time content hashes for the bundled public/ data files, keyed by
    // filename. See astro.config.mjs's `dataFileVersions` for how this is
    // populated.
    readonly DATA_FILE_VERSIONS: Record<string, string>;
}
