import {Routes} from '@angular/router';
import { CreateMessageComponent } from './create-message/create-message.component';
import { ReadMessageComponent } from './read-message/read-message.component';

export const routes: Routes = [
  { path: '', component: CreateMessageComponent },
  { path: 'm/:id', component: ReadMessageComponent },
  { path: '**', redirectTo: '' }
];
