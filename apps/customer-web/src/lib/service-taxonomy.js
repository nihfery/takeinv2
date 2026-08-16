export const fallbackServiceTaxonomy = [
    {
        id: 'nail',
        name: 'Nail',
        slug: 'nail',
        description: 'Nail care and styling services',
        children: [
            { id: 'pedicure', name: 'Pedicure', slug: 'pedicure', description: 'Foot and nail care treatments' },
            { id: 'manicure', name: 'Manicure', slug: 'manicure', description: 'Hand and nail care treatments' },
            { id: 'nail-art', name: 'Nail Art', slug: 'nail-art', description: 'Creative nail designs and finishes' },
            { id: 'nail-extension', name: 'Nail Extension', slug: 'nail-extension', description: 'Nail lengthening and shaping services' },
        ],
    },
    {
        id: 'wellness',
        name: 'Wellness',
        slug: 'wellness',
        description: 'Treatments for relaxation and body care',
        children: [
            { id: 'massage-spa', name: 'Massage & Spa', slug: 'massage-spa', description: 'Relaxing massage and spa treatments' },
            { id: 'waxing', name: 'Waxing', slug: 'waxing', description: 'Professional hair removal treatments' },
            { id: 'scalp-therapy', name: 'Scalp Therapy', slug: 'scalp-therapy', description: 'Specialist scalp and hair-root care' },
        ],
    },
    {
        id: 'beauty',
        name: 'Beauty',
        slug: 'beauty',
        description: 'Beauty treatments for your face and look',
        children: [
            { id: 'facial', name: 'Facial', slug: 'facial', description: 'Skin cleansing and facial treatments' },
            { id: 'eyelash', name: 'Eyelash', slug: 'eyelash', description: 'Eyelash extensions, lifts, and care' },
            { id: 'eyebrow', name: 'Eyebrow', slug: 'eyebrow', description: 'Eyebrow shaping and styling' },
            { id: 'beauty-nail', name: 'Nail', slug: 'beauty-nail', description: 'Nail care and beauty treatments' },
            { id: 'makeup', name: 'Makeup', slug: 'makeup', description: 'Professional makeup for every occasion' },
        ],
    },
    {
        id: 'hair-salon',
        name: 'Hair Salon',
        slug: 'hair-salon',
        description: 'Professional hair care and styling services',
        children: [
            { id: 'haircut', name: 'Haircut', slug: 'haircut', description: 'Haircuts tailored to your preferred style' },
            { id: 'hair-wash', name: 'Hair Wash', slug: 'hair-wash', description: 'Hair washing and conditioning treatments' },
            { id: 'colouring', name: 'Colouring', slug: 'colouring', description: 'Professional hair colouring services' },
            { id: 'styling', name: 'Styling', slug: 'styling', description: 'Hair styling for everyday and special events' },
        ],
    },
];

export function normalizeCategorySlug(value) {
    try {
        return decodeURIComponent(String(value || '')).trim().toLowerCase();
    } catch {
        return String(value || '').trim().toLowerCase();
    }
}

function taxonomyId(value) {
    return String(value ?? '').trim();
}

function normalizeTaxonomyItem(item = {}) {
    return {
        ...item,
        id: item.id ?? item.category_id ?? item.slug ?? item.name,
        name: String(item.name || item.title || item.label || '').trim(),
        slug: normalizeCategorySlug(item.slug || item.name || item.title),
        parent_id: item.parent_id ?? item.parentId ?? null,
    };
}

export function buildServiceTaxonomy(categories = []) {
    if (!Array.isArray(categories)) return [];

    const normalized = categories.map(normalizeTaxonomyItem).filter((item) => item.name && item.slug);
    const byID = new Map(normalized.map((item) => [taxonomyId(item.id), item]));
    const childrenByParent = new Map();

    normalized.forEach((item) => {
        const parentID = taxonomyId(item.parent_id);
        if (!parentID) return;

        const siblings = childrenByParent.get(parentID) || [];
        siblings.push(item);
        childrenByParent.set(parentID, siblings);
    });

    return normalized
        .filter((item) => !taxonomyId(item.parent_id) || !byID.has(taxonomyId(item.parent_id)))
        .map((group) => {
            const nested = Array.isArray(group.children)
                ? group.children.map(normalizeTaxonomyItem).filter((item) => item.name && item.slug)
                : [];
            const flatChildren = childrenByParent.get(taxonomyId(group.id)) || [];
            const children = [...new Map(
                [...nested, ...flatChildren].map((item) => [taxonomyId(item.id) || item.slug, item])
            ).values()];

            return { ...group, children };
        })
        .filter((group) => group.children.length > 0);
}

export function getCategoryPath(category) {
    const slug = normalizeCategorySlug(category?.slug || category?.name);
    return slug ? `/categories/${encodeURIComponent(slug)}` : '/';
}

function normalizeTaxonomyId(value) {
    const normalized = String(value ?? '').trim();
    return normalized && normalized !== '0' ? normalized : '';
}

export function normalizeTaxonomyFilter(filter = {}) {
    return {
        categoryId: normalizeTaxonomyId(filter.categoryId ?? filter.category_id),
        categorySlug: normalizeCategorySlug(filter.categorySlug ?? filter.category_slug),
        subcategoryId: normalizeTaxonomyId(filter.subcategoryId ?? filter.subcategory_id),
        subcategorySlug: normalizeCategorySlug(filter.subcategorySlug ?? filter.subcategory_slug),
    };
}

export function hasTaxonomyFilter(filter = {}) {
    const normalized = normalizeTaxonomyFilter(filter);
    return Boolean(
        normalized.categoryId
        || normalized.categorySlug
        || normalized.subcategoryId
        || normalized.subcategorySlug
    );
}

export function serviceMatchesTaxonomy(service, filter = {}) {
    const expected = normalizeTaxonomyFilter(filter);
    if (!hasTaxonomyFilter(expected)) return true;

    const actual = {
        categoryId: normalizeTaxonomyId(service?.mainCategoryId ?? service?.main_category_id),
        categorySlug: normalizeCategorySlug(service?.mainCategorySlug ?? service?.main_category_slug),
        subcategoryId: normalizeTaxonomyId(service?.categoryId ?? service?.category_id),
        subcategorySlug: normalizeCategorySlug(service?.categorySlug ?? service?.category_slug),
    };

    // A strict category search only accepts services with the complete relation.
    if (!actual.categorySlug || !actual.subcategorySlug) return false;
    if (expected.categorySlug && actual.categorySlug !== expected.categorySlug) return false;
    if (expected.subcategorySlug && actual.subcategorySlug !== expected.subcategorySlug) return false;
    if (expected.categoryId && actual.categoryId && actual.categoryId !== expected.categoryId) return false;
    if (expected.subcategoryId && actual.subcategoryId && actual.subcategoryId !== expected.subcategoryId) return false;

    return true;
}

export function branchMatchesTaxonomy(branch, filter = {}) {
    if (!hasTaxonomyFilter(filter)) return true;
    return Array.isArray(branch?.services)
        && branch.services.some((service) => serviceMatchesTaxonomy(service, filter));
}
