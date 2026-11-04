'use client';

import { Button, Chip, Dialog, DialogClose, IconButton, Tooltip } from '@/ui/components';
import { BedDouble, Info } from '@/ui/icons';
import { ChipSheet } from '../../_reference/ChipSheet';
import { housekeeper } from '../samples';
import { Section, Specimen, States } from '../Specimen';

const housing = { job: housekeeper, chip: 'housing' } as const;

export function OverlaysSection() {
  return (
    <>
      <Section
        id="sheet"
        title="Sheet"
        description="Every chip opens one. Below 768 px it rises from the bottom with a drag handle; from 768 px it is a panel on the right. Focus moves into it, Escape closes it, and focus returns to the chip. Open sheets follow the page theme; their open state in both themes is in the screenshot package."
      >
        <Specimen title="Triggers">
          {() => (
            <States
              items={[
                {
                  label: 'From a chip',
                  node: (
                    <ChipSheet
                      content={housing}
                      trigger={
                        <Chip
                          label="Housing"
                          icon={BedDouble}
                          value="Provided"
                          tone="success"
                          onOpen={() => {}}
                          className="w-36"
                        />
                      }
                    />
                  ),
                },
                {
                  label: 'From a button',
                  node: (
                    <ChipSheet
                      content={housing}
                      trigger={<Button variant="secondary">Open the Housing sheet</Button>}
                    />
                  ),
                },
              ]}
            />
          )}
        </Specimen>
      </Section>

      <Section
        id="dialog"
        title="Dialog"
        description="A centered confirmation or short form. The destructive button names the action; the other one keeps things as they are."
      >
        <Specimen title="Confirmation">
          {() => (
            <Dialog
              title="Withdraw your application?"
              description="Kettle Ridge Lodge will no longer see your application for Lodge Housekeeper. You can apply again while the listing is open."
              trigger={<Button variant="secondary">Withdraw application</Button>}
              footer={
                <>
                  <DialogClose asChild>
                    <Button variant="ghost">Keep it</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="danger">Withdraw</Button>
                  </DialogClose>
                </>
              }
            />
          )}
        </Specimen>
      </Section>

      <Section
        id="tooltip"
        title="Tooltip"
        description="Extra information on hover or keyboard focus. Never the only name of a control: the button below is named by its label."
      >
        <Specimen title="On an icon button">
          {() => (
            <Tooltip content="How well this candidate matches the listing, from 0 to 100">
              <IconButton icon={Info} label="Fit score" variant="outline" />
            </Tooltip>
          )}
        </Specimen>
      </Section>
    </>
  );
}
