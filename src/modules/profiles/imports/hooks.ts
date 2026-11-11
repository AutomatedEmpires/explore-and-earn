// Import lifecycle hooks (SP4 spec 8.6). Under FD-2 an import's source file is an import source
// only: it is never kept as the seeker's resume or attached to an application, so nothing outside
// the import references it and expiry deletes it. The plan's registerResumeMediaReferences and
// markImportSourceInUse (which kept a source alive as an upload-mode resume) are therefore not
// part of the contract. W3 owns this file from Phase B.
export {};
