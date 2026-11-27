# Faltas

Página **Financeiro → Faltas** (`/faltas`). Calcula, a partir do relógio de ponto, as faltas, o banco de horas e os vencimentos do mês, mostra a folha tal como fica no Google Sheets «Faltas- 2026» e só escreve quando se carrega em **Passar para o Drive**.

## Como se usa

1. Escolher o mês e carregar em **Começar**: as pessoas (nº, nome, salário base, subsídio/dia, taxa de IRS, banco de horas) vêm da folha do mês anterior (ex.: «Outubro26»).
2. **Carregar relógio**: exportação do programa do relógio (`Exportador_Base.xls`) ou relatório de picagens em PDF (lido com IA, tipo `picagens` da função `ler-documento`). Pode carregar-se várias vezes; os dias novos juntam-se aos que já estavam.
3. Rever: clicar no nome abre os dias; confirmar picagens esquecidas; marcar ausências como baixa, férias ou falta justificada; alterar prémio, KM, taxa de IRS, observações.
4. **Passar para o Drive**: cria «Novembro26» duplicando o mês anterior (mesma formatação), acerta o número de linhas, escreve valores e fórmulas e refaz os TOTAIS.

O rascunho do mês fica guardado em `documentos` (coleção `faltasMeses`, id `AAAA-MM`).

## Regras

- Horário 8h00–12h00 e 13h00–17h10 (8h10/dia); tolerância de 5 min na entrada da manhã e no regresso do almoço (acima disso conta o atraso todo).
- Horas extra só no período indicado na página (ex.: 16/11 a 23/12): antes das 8h, ao almoço e depois das 17h10 → banco de horas. Sábados → «Horas- Sábado».
- Faltam 1 ou 2 picagens: se há uma de manhã e outra à tarde, completa as do almoço e assinala para confirmar.
- Dia útil sem picagens = falta de dia inteiro (pode passar a baixa, férias ou justificada).
- Dias úteis = dias de semana menos feriados nacionais e 3 de maio (Barcelos).
- Não contam: 6 e 80. Não picam (presentes): 70, 73, 83.
- As faltas que não são dias inteiros descontam primeiro do banco de horas.
- Salário/hora = base ÷ 173,33; baixa = dias × base ÷ 30; base de descontos = base + prémio − faltas − baixa; IRS, SS 11 % e SS empresa 23,75 % sobre a base de descontos; acidentes de trabalho = 631,02 € ÷ 3 ÷ nº de pessoas.
- As fórmulas escritas na folha usam só números inteiros (ex.: `=O3*100/17333`) para não dependerem da vírgula/ponto decimal.
