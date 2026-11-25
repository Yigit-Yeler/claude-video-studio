import { Accordion, Code } from "@mantine/core";
import type { StudioInputProps } from "@/lib/studio";

/** Render'a gönderilecek ayarların ham hâli (geliştirici görünümü). */
export function InputPropsInspector({ inputProps }: { inputProps: StudioInputProps }) {
  return (
    <Accordion variant="contained">
      <Accordion.Item value="props">
        <Accordion.Control>inputProps</Accordion.Control>
        <Accordion.Panel>
          <Code block>{JSON.stringify(inputProps, null, 2)}</Code>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
