import type { ComponentProps } from 'react';

export type ImgProps = Omit<ComponentProps<'img'>, 'alt' | 'src'> & {
  src: string;
  /** Required. Use "" only for a purely decorative image. */
  alt: string;
};

/**
 * A plain <img>. User media is already re-encoded into 320/640/1280 px WebP variants by the
 * media pipeline, so next/image's optimizer would only add a second resize; pass `srcSet` and
 * `sizes` for the variants instead.
 */
export function Img({ alt, loading = 'lazy', decoding = 'async', ...props }: ImgProps) {
  // eslint-disable-next-line @next/next/no-img-element -- media is pre-sized; see above
  return <img alt={alt} loading={loading} decoding={decoding} {...props} />;
}
