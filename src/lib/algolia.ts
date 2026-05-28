import {algoliasearch} from 'algoliasearch';

export const ALGOLIA_APP_ID = 'CVBOBUD00F';
export const ALGOLIA_API_KEY = '18070b5d1e89e28b1ca3920fffdd2f11';
export const ALGOLIA_INDEX_NAME = 'questions';

export const algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);
