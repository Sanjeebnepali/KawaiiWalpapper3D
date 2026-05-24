// Cross-cutting types shared by several mockData concern modules. Kept in a
// dependency-free module so concern siblings (mood, formats, …) can reference
// them without importing back through `mockData` and forming an import cycle.

export type CategoryPhoto = { id: string; image: string };

export type FeaturedItem = {
  id: string;
  title: string;
  tag: string;
  image: string;
  accent: string;
  /** True for the premium-collection headline — drives a diamond badge. */
  premium?: boolean;
};
