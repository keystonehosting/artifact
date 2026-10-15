import { render } from 'preact';
import '../../ui/tokens.css';
import '../../ui/app.css';
import { Compare } from './Compare';

render(<Compare />, document.getElementById('app')!);
