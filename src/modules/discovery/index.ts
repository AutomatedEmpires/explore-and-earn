// Public API of the discovery module. Task 2 lands the data contract; Task 3 completes the index.
export {
  PROJECTION_SELECT,
  projectionSelect,
  type ProjectionRow,
  type ProjectionRowInput,
} from './projection-columns';
export { searchVectorSql, type SearchVectorFields } from './search-vector';
