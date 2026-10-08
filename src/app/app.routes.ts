import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { TokenGenerator } from './pages/token-generator/token-generator';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'token-generator', component: TokenGenerator, title: 'Token generator · IBD Release Notes' },
];
