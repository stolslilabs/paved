/**
 * The feature highlight's codes and heights (FEATURE-HL), apart from the classifier (`features.ts`), which loads only
 * once a highlight is on: the tile shader (`TileRenderer`) and the look (`LookSettings.featureHighlight`) need these.
 */

/** The features a voxel column can show, by code: the code a label map holds (`packLabels`, `feature * 16 + area`). */
export const FEATURES = ["none", "city", "road", "forest", "wonder"] as const;
export type FeatureName = (typeof FEATURES)[number];
export const FEATURE_CODE: Record<FeatureName, number> = { none: 0, city: 1, road: 2, forest: 3, wonder: 4 };

/** The columns of a tile's label map a side: a voxel each, as a tile model is 40 voxels wide (`TILE_VOXELS`). */
export const LABEL_COLUMNS = 40;

/** The ground's top, in voxels above the model's bottom: every base model's ground is 4 voxels high (0.4 of its 4 units). */
export const GROUND_VOXELS = 4;
/**
 * How far above the ground's top a face stands on it, in voxels: a column topped higher by no vegetation or road is a
 * structure (outside a city), and a road column's fragment higher is a bridge's deck, not the road (`TileRenderer`). The
 * sunk road is at about 3 voxels, the ground's top at 4.
 */
export const ABOVE_GROUND_VOXELS = 0.5;
