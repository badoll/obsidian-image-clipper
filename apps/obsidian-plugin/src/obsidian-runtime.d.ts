import type { Editor, TAbstractFile, TFile } from "obsidian";

declare module "obsidian" {
  interface App {
    internalPlugins: {
      plugins: {
        canvas?: {
          instance?: {
            index?: {
              parseText(text: string): Promise<{ links?: Array<{ link: string }> }> | { links?: Array<{ link: string }> };
            };
          };
        };
      };
    };
  }

  interface DataAdapter {
    basePath?: string;
  }

  interface FileManager {
    processFrontMatter(file: TFile, fn: (frontmatter: any) => any): Promise<void>;
  }

  interface TAbstractFile {
    children?: TAbstractFile[];
  }

  interface Vault {
    exists(path: string): Promise<boolean>;
    getConfig(key: string): any;
  }

  interface Workspace {
    activeEditor?: {
      editor: Editor;
      file?: TFile;
      getSelection(): string;
    };
  }
}
