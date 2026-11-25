"use client";

import { Button, FileButton, type ButtonProps } from "@mantine/core";
import { IconUpload } from "@tabler/icons-react";
import type { ReactNode } from "react";

type UploadButtonProps = Omit<ButtonProps, "children"> & {
  accept: string;
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  icon?: ReactNode;
  children: ReactNode;
};

/** Dosya seçtiren buton. Tek ya da çoklu seçimde de dosyaları her zaman dizi olarak verir. */
export function UploadButton({ accept, onFiles, multiple = false, icon, children, ...buttonProps }: UploadButtonProps) {
  const button = (props: { onClick: () => void }) => (
    <Button variant="light" leftSection={icon ?? <IconUpload size={16} />} {...buttonProps} {...props}>
      {children}
    </Button>
  );

  return multiple ? (
    <FileButton multiple accept={accept} onChange={onFiles}>
      {button}
    </FileButton>
  ) : (
    <FileButton accept={accept} onChange={(file) => onFiles(file ? [file] : [])}>
      {button}
    </FileButton>
  );
}
