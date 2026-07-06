/**
 * Visual-asset system public API.
 *
 * One icon family (Phosphor, via ../icons), rendered locally:
 *   - icons         -> ../icons (canonical <Icon>)
 *   - illustrations -> <AppIllustration> + ILLUSTRATION_REGISTRY
 */

export * from "./types"
export * from "./illustrations"
export { AppIllustration, type AppIllustrationProps } from "./AppIllustration"
