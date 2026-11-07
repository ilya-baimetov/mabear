import {defineConfig} from 'vite';
// A capture must not reload halfway through when another agent edits the app.
export default defineConfig({server:{hmr:false}});
