import { ArticleDetail, ArticlesLibrary } from "../features/articles/ArticlesPages";
export default [
  {path:"/articles/",name:"Articles",component:ArticlesLibrary,layout:"public" as const},
  {path:"/articles/category/:categorySlug/",name:"Article category",component:ArticlesLibrary,layout:"public" as const},
  {path:"/articles/:slug/",name:"Article",component:ArticleDetail,layout:"public" as const},
];
