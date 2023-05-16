import { Box, Group, Text } from "@mantine/core";
import { Dropzone, DropzoneProps } from "@mantine/dropzone";

const FileUploadDropzone = (props: Omit<DropzoneProps, "children">) => {
  return (
    <Dropzone {...props}>
      <Group position="center" spacing="xl">
        <Box>
          <Text size="sm" color="dimmed" inline mt={7}>
            Drag images here or click to select files
          </Text>
        </Box>
      </Group>
    </Dropzone>
  );
};

export { FileUploadDropzone };
