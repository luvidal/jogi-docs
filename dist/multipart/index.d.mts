import { h as MultiPartConfig } from '../types-jOhdMz9z.mjs';

/**
 * Multi-Part Document Utilities
 *
 * Some documents require multiple files to be complete (e.g., cedula front + back).
 * Configuration comes from doctypes.json via the `parts` field.
 */

declare function getMultiPartConfig(doctypeid: string): MultiPartConfig | null;
declare function isMultiPartDocType(doctypeid: string): boolean;
declare function getMultiPartDocTypeIds(): string[];
declare function getPartIdFromFilename(filename: string): string | null;
declare function getDocTypeFromFilename(filename: string): string | null;
declare function isMultiPartFile(filename: string, doctypeid: string): boolean;
declare function getPartLabel(doctypeid: string, partId: string): string | null;
declare function partFilenameConditions(partId: string, doctypeid?: string): Array<{
    filename: {
        endsWith: string;
    };
}>;

export { MultiPartConfig, getDocTypeFromFilename, getMultiPartConfig, getMultiPartDocTypeIds, getPartIdFromFilename, getPartLabel, isMultiPartDocType, isMultiPartFile, partFilenameConditions };
