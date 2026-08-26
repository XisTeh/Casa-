import { CheckCircle2, Download, Share2, Smartphone } from 'lucide-react';
import { Button } from '../components/Button/Button';
import { usePwaInstall } from './use-pwa-install';

export function PwaInstallPanel() {
  const { installed, installable, installing, ios, lastChoice, promptInstall } = usePwaInstall();

  if (installed) {
    return (
      <div className="pwa-install-status" role="status">
        <CheckCircle2 aria-hidden="true" size={18} />
        <span>
          <strong>Casaê instalado</strong>
          <small>O aplicativo já está disponível neste dispositivo.</small>
        </span>
      </div>
    );
  }

  if (installing) {
    return (
      <div className="pwa-install-status" role="status">
        <Download aria-hidden="true" size={18} />
        <span>
          <strong>Concluindo instalação</strong>
          <small>O navegador está adicionando o Casaê ao dispositivo.</small>
        </span>
      </div>
    );
  }

  if (installable) {
    return (
      <div className="pwa-install-action">
        <p>Instale o Casaê para abrir mais rápido e usar como aplicativo.</p>
        <Button
          icon={<Download aria-hidden="true" size={18} />}
          onClick={() => void promptInstall()}
        >
          Instalar Casaê
        </Button>
        {lastChoice === 'dismissed' && (
          <small role="status">
            Instalação cancelada. Você pode tentar novamente quando quiser.
          </small>
        )}
      </div>
    );
  }

  if (ios) {
    return (
      <div className="pwa-install-instructions">
        <Share2 aria-hidden="true" size={18} />
        <span>
          <strong>Instalar no iPhone ou iPad</strong>
          <small>Use “Compartilhar → Adicionar à Tela de Início” no Safari.</small>
        </span>
      </div>
    );
  }

  return (
    <div className="pwa-install-instructions">
      <Smartphone aria-hidden="true" size={18} />
      <span>
        <strong>Instalação do aplicativo</strong>
        <small>A opção “Instalar Casaê” aparecerá aqui quando o navegador permitir.</small>
      </span>
    </div>
  );
}
