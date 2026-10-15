import { render } from 'preact';
import '../../ui/tokens.css';
import './popup.css';
import { Popup } from './Popup';

render(<Popup />, document.getElementById('app')!);
