import { render } from 'preact';
import '../../ui/tokens.css';
import '../../ui/app.css';
import { Vault } from '../../ui/vault/Vault';

render(<Vault />, document.getElementById('app')!);
