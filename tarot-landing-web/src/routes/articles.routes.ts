import { lazy } from "react";
const ArticlesLibrary = lazy(() => import("../features/articles/ArticlesPages").then((m) => ({ default: m.ArticlesLibrary })));
const ArticleDetail = lazy(() => import("../features/articles/ArticlesPages").then((m) => ({ default: m.ArticleDetail })));
export default [
  {path:"/articles/",name:"Articles",component:ArticlesLibrary,layout:"public" as const},
  {path:"/articles/category/:categorySlug/",name:"Article category",component:ArticlesLibrary,layout:"public" as const},
  {path:"/articles/:slug/",name:"Article",component:ArticleDetail,layout:"public" as const},
];
