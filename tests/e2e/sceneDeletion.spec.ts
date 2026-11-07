import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { login } from './login';

test('delete is visible beside the scene title; cancel, delete, and last-scene reset work in EN/RU', async ({page}) => {
  test.setTimeout(120000);
  // This is an authoring control: deleting text must work even before 3D assets load.
  await page.route('**/*.glb', route => route.abort());
  await login(page); await page.goto('/');
  await page.setViewportSize({width:1280,height:720});
  const text = page.getByTestId('moment-text');
  const remove = page.getByTestId('request-remove-moment');
  await text.fill('Masha waves.');
  await expect(remove).toHaveText('Delete scene');
  await expect(remove).toBeInViewport();
  await page.getByTestId('add-next-moment').click();
  await text.fill('Bear claps.');
  await expect(page.getByTestId('moment-card')).toHaveCount(2);
  await remove.click();
  await expect(page.getByTestId('remove-moment-dialog')).toBeVisible();
  await page.getByTestId('keep-moment').click();
  await expect(text).toHaveValue('Bear claps.');
  await expect(page.getByTestId('moment-card')).toHaveCount(2);
  await remove.click(); await page.getByTestId('remove-moment').click();
  await expect(page.getByTestId('moment-card')).toHaveCount(1);
  await expect(text).toHaveValue('Masha waves.');

  await page.getByTestId('lang-ru').click();
  await page.setViewportSize({width:390,height:844});
  await expect(remove).toHaveText('Удалить сцену');
  await expect(remove).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  mkdirSync('docs/scene-deletion',{recursive:true});
  await page.getByTestId('moment-workbench').screenshot({path:'docs/scene-deletion/delete-button-ru.png'});
  await remove.click();
  await expect(page.getByTestId('remove-moment-dialog')).toContainText('Останется пустая сцена');
  await page.getByTestId('remove-moment').click();
  await expect(text).toHaveValue('');
  await expect(page.getByTestId('moment-card')).toHaveCount(1);
  await expect(page.getByTestId('remove-moment-dialog')).not.toBeVisible();
  await page.reload();
  await expect(text).toHaveValue('');
});
