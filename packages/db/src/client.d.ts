export interface DatabaseClientConfig {
    readonly connectionString?: string;
    readonly role?: "service" | "request";
}
export declare function createDatabaseClient(config?: DatabaseClientConfig): {
    kind: "placeholder-db-client";
    config: DatabaseClientConfig;
};
