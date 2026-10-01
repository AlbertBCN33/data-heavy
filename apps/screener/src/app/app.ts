import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastOutlet } from '@data-heavy/ui/toast';

@Component({
  selector: 'dh-root',
  imports: [RouterOutlet, ToastOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
