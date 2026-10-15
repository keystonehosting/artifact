import { render } from 'preact';
import '../../ui/tokens.css';
import '../../ui/app.css';
import { SidePanel } from '../../ui/app/SidePanel';

render(<SidePanel />, document.getElementById('app')!);
