/**
 * Ambient declaration for the `clerk-real/server` specifier used by the dev
 * bench Clerk shim. It has no runtime existence in TypeScript's view — at build
 * time next.config aliases it to the real "@clerk/nextjs/server" file. This
 * declaration simply hands the shim the real module's types so it type-checks
 * without a tsconfig path mapping.
 */
declare module "clerk-real/server" {
  export * from "@clerk/nextjs/server";
}
