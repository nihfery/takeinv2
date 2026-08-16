import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCatalogBranches } from '../src/lib/landing-data.js';
import { buildServiceTaxonomy } from '../src/lib/service-taxonomy.js';

const categories = [
    { id: 16, name: 'Hair Salon', slug: 'hair-salon', parent_id: null },
    { id: 17, name: 'Haircut', slug: 'haircut', parent_id: 16 },
];

test('buildServiceTaxonomy converts the flat Go catalog response into parent groups', () => {
    assert.deepEqual(buildServiceTaxonomy(categories), [
        {
            id: 16,
            name: 'Hair Salon',
            slug: 'hair-salon',
            parent_id: null,
            children: [
                { id: 17, name: 'Haircut', slug: 'haircut', parent_id: 16 },
            ],
        },
    ]);
});

test('normalizeCatalogBranches maps projection fields and keeps branch services visible', () => {
    const [branch] = normalizeCatalogBranches([
        {
            branch_id: 1,
            provider_id: 7,
            branch_name: 'Cantika Beauty Salon - Jakarta',
            city_id: 'Jakarta',
            state_id: 'DKI Jakarta',
            address: 'Jl. Cantika No. 1',
            services_count: 1,
            min_price: 45000,
            services: [
                {
                    id: 10,
                    title: 'Potong Rambut Pria',
                    category_id: 17,
                    category_text: 'Haircut',
                    price: 45000,
                    estimated_duration: 30,
                },
            ],
        },
    ], categories);

    assert.equal(branch.id, 1);
    assert.equal(branch.name, 'Cantika Beauty Salon - Jakarta');
    assert.equal(branch.city, 'Jakarta');
    assert.equal(branch.servicesCount, 1);
    assert.equal(branch.minPrice, 45000);
    assert.deepEqual(branch.serviceCategories, ['Haircut']);
    assert.deepEqual(branch.services[0], {
        id: 10,
        title: 'Potong Rambut Pria',
        category_id: 17,
        category_text: 'Haircut',
        price: 45000,
        estimated_duration: 30,
        slug: '',
        code: '',
        name: 'Potong Rambut Pria',
        category: 'Haircut',
        categoryId: 17,
        categorySlug: 'haircut',
        mainCategoryId: 16,
        mainCategorySlug: 'hair-salon',
        description: '',
        minimum_duration: 0,
    });
});
