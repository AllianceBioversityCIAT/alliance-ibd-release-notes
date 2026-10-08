import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
})
export class Home {
  protected readonly title = signal('IBD Release Notes');
}
