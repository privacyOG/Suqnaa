export interface CategorySummary {
  id: string;
  parentId: string | null;
  slug: string;
  nameEn: string;
  nameAr: string | null;
  sortOrder: number;
}

const apiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000';

export class CategoryRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'CategoryRequestError';
  }
}

function normalizeCategory(value: Record<string, unknown>): CategorySummary {
  return {
    id: String(value.id),
    parentId: value.parent_id ? String(value.parent_id) : null,
    slug: String(value.slug),
    nameEn: String(value.name_en),
    nameAr: value.name_ar ? String(value.name_ar) : null,
    sortOrder: Number(value.sort_order ?? 0)
  };
}

export async function getPublicCategories(): Promise<CategorySummary[]> {
  const response = await fetch(`${apiBaseUrl}/v1/categories`, {
    cache: 'no-store',
    headers: { accept: 'application/json' }
  });

  if (!response.ok) {
    throw new CategoryRequestError('Unable to load categories', response.status);
  }

  const payload = await response.json() as { categories?: Record<string, unknown>[] };
  return (payload.categories ?? [])
    .map(normalizeCategory)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.nameEn.localeCompare(right.nameEn));
}
