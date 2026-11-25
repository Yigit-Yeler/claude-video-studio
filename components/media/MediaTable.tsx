import { Table } from "@mantine/core";
import { formatBytes, formatTimestamp } from "@/lib/format";
import type { MediaItem } from "@/lib/media-types";
import { kindLabel } from "./media-labels";

export function MediaTable({ items }: { items: MediaItem[] }) {
  return (
    <Table.ScrollContainer minWidth={720}>
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Önizleme</Table.Th>
            <Table.Th>Ad</Table.Th>
            <Table.Th>Tür</Table.Th>
            <Table.Th>Boyut</Table.Th>
            <Table.Th>Güncelleme</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => (
            <Table.Tr key={item.relativePath}>
              <Table.Td>
                <video
                  src={item.url}
                  muted
                  playsInline
                  preload="metadata"
                  style={{ width: 72, height: 128, objectFit: "cover", borderRadius: 8, background: "#111" }}
                />
              </Table.Td>
              <Table.Td>{item.name}</Table.Td>
              <Table.Td>{kindLabel(item.kind)}</Table.Td>
              <Table.Td>{formatBytes(item.size)}</Table.Td>
              <Table.Td>{formatTimestamp(item.updatedAt)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
