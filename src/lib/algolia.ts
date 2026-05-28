import {algoliasearch} from 'algoliasearch';

export const ALGOLIA_APP_ID = 'CVBOBUD00F';
export const ALGOLIA_SEARCH_KEY = '3473b70a89c2f533f248c97373ef1bea';
export const ALGOLIA_INDEX_NAME = 'questions';

export const algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_KEY);
