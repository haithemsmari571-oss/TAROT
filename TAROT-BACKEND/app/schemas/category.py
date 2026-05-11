from pydantic import BaseModel


class CategoryBase(BaseModel):
    title: str


class CategoryRead(CategoryBase):
    id: int

    class Config:
        from_attributes = True


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(CategoryBase):
    pass
