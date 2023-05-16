import { createContext, useContext } from "react";

import {
  ActionIcon,
  Card,
  Center,
  DefaultMantineColor,
  Group,
  Menu,
  Progress,
  Text,
} from "@mantine/core";
import { IconDots } from "@tabler/icons-react";

import { FileUploadStatus } from "@/types";
import { noop } from "@/utils/noop";

type MenuActions = {
  onMoveTo: (id: string) => void;
  onDelete: (id: string) => void;
};

type FileContextType = {
  id?: string;
} & MenuActions;

type FileProviderProps = {
  children: React.ReactNode;
  values: FileContextType;
};

type FileProps = Partial<FileContextType> & {
  name: string;
  progressValue: number;
  status: FileUploadStatus;
};

const FileContext = createContext<FileContextType | null>(null);

const FileProvider = ({ children, values }: FileProviderProps) => {
  return <FileContext.Provider value={values}>{children}</FileContext.Provider>;
};

const useFile = () => useContext(FileContext) as FileContextType;

const MenuSection = () => {
  const { id, onDelete, onMoveTo } = useFile();

  return (
    <Card.Section inheritPadding p="xs">
      <Group position="right">
        <Menu withinPortal position="bottom-end" shadow="sm">
          <Menu.Target>
            <ActionIcon>
              <IconDots size="1rem" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => id && onMoveTo(id)}>Move to</Menu.Item>
            <Menu.Item onClick={() => id && onDelete(id)}>Delete</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Card.Section>
  );
};

const progressBarColor: Record<
  FileUploadStatus,
  DefaultMantineColor | undefined
> = {
  completed: "green",
  error: "red",
  pending: "blue",
  waiting: undefined,
};

const progressBarText = (status: FileUploadStatus, progressValue: number) => {
  switch (status) {
    case "completed":
      return "Complete";
    case "error":
      return "Error";
    case "waiting":
      return "Waiting...";
    default:
      return `${progressValue}%`;
  }
};

const File = ({
  id,
  name,
  onDelete = noop,
  onMoveTo = noop,
  progressValue = 0,
  status,
}: FileProps) => {
  return (
    <FileProvider values={{ id, onDelete, onMoveTo }}>
      <Card mih={180} shadow="sm" radius="md">
        {status === "completed" && <MenuSection />}
        <Center h={80} mx="auto">
          <Text size="xs" lineClamp={3}>
            {name}
          </Text>
        </Center>
        <Progress
          color={progressBarColor[status]}
          value={progressValue}
          label={progressBarText(status, progressValue)}
          size="xl"
          radius="xl"
        />
      </Card>
    </FileProvider>
  );
};

export { File };
