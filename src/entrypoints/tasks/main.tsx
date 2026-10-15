import { render } from 'preact';
import '../../ui/tokens.css';
import '../../ui/app.css';
import { Tasks } from '../../ui/tasks/Tasks';

render(<Tasks />, document.getElementById('app')!);
