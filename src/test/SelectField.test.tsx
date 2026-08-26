import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SelectField } from '../components/SelectField/SelectField';

describe('SelectField', () => {
  const options = [
    { label: 'Todos os mercados', value: '' },
    { label: 'Mercado Casaê', value: 'mercado-casae' },
  ];

  it('abre com o visual customizado e seleciona uma opção', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SelectField label="Mercado" onChange={onChange} options={options} value="" />);

    await user.click(screen.getByRole('combobox', { name: 'Mercado' }));
    expect(screen.getByRole('listbox', { name: 'Mercado' })).toBeVisible();
    await user.click(screen.getByRole('option', { name: 'Mercado Casaê' }));

    expect(onChange).toHaveBeenCalledWith('mercado-casae');
    expect(screen.queryByRole('listbox', { name: 'Mercado' })).not.toBeInTheDocument();
  });

  it('permite selecionar pelo teclado e devolve o foco ao controle', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SelectField label="Mercado" onChange={onChange} options={options} value="" />);

    const trigger = screen.getByRole('combobox', { name: 'Mercado' });
    trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('mercado-casae');
    expect(trigger).toHaveFocus();
  });
});
