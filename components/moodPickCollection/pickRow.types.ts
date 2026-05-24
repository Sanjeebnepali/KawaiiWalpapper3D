export type PickRow =
  | {
      kind: 'collection';
      id: string;
      name: string;
      photoIds: string[];
      thumb: string;
    }
  | {
      kind: 'pack';
      id: string;
      seedPackId: string;
      name: string;
      photoIds: string[];
      thumb: string;
      activated: boolean;
    };
