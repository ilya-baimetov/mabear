import {writeFile} from 'node:fs/promises';
import {trialStories} from './rapier-trial-fixtures';
await writeFile('docs/rapier-trial/stories.json',JSON.stringify(trialStories(),null,2));
