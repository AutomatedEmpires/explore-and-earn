/**
 * Visual-asset system public API.
 *
 * One Streamline Freehand family across three layers, delivered from Cloudinary:
 *   - icons        -> re-exported from ../icons (canonical <Icon>) + ergonomic <AppIcon>
 *   - illustrations -> <AppIllustration> + ILLUSTRATION_REGISTRY
 *   - elements      -> <AppElement> + ELEMENT_REGISTRY
 *
 * See STREAMLINE_ASSET_REGISTRY.md for the full taxonomy and authoring guide.
 */

export * from "./types"
export * from "./illustrations"
export * from "./elements"
export { AppIcon, type AppIconProps } from "./AppIcon"
export { AppIllustration, type AppIllustrationProps } from "./AppIllustration"
export { AppElement, type AppElementProps } from "./AppElement"
export { useStreamlineSvg, streamlineUrl } from "./useStreamlineSvg"
