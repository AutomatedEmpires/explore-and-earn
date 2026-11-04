import type { Metadata } from 'next';
import { housekeeper } from '../../_gallery/samples';
import { SeekScreen } from '../../_reference/SeekScreen';

export const metadata: Metadata = { title: 'Reference: Housing pop-up' };

/** The design board's Housing artboard: the Housing chip's sheet, open over Seek. */
export default function HousingReference() {
  return <SeekScreen initialSheet={{ job: housekeeper, chip: 'housing' }} />;
}
