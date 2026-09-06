import { useState } from 'react';
import { LifeBuoy, Loader2, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  DISPOSITION_LABELS,
  uploadIncidentAttachment,
  useOpenIncident,
  type Disposition,
  type IncidentLineInput,
} from '@/hooks/useAssistance';
import type { DeliveryAttempt, DeliveryAttemptLine } from '@/hooks/useDeliveryAttempts';

interface Props {
  attempt: DeliveryAttempt;
  lines: DeliveryAttemptLine[];
}

/**
 * Abrir assistência é independente do resultado da entrega: pode haver artigo
 * entregue com avaria e assistência aberta. Não cria retorno nem baixa de stock.
 */
export function AssistanceDialog({ attempt, lines }: Props) {
  const { user, profile } = useAuth();
  const open = useOpenIncident();
  const [isOpen, setIsOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Record<string, { qty: number; disposition: Disposition }>>({});
  const [files, setFiles] = useState<{ name: string; mime_type: string; storage_reference: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [opKey, setOpKey] = useState(() => crypto.randomUUID());

  const toggle = (l: DeliveryAttemptLine) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[l.id]) delete next[l.id];
      else next[l.id] = { qty: Math.max(l.delivered_quantity || 1, 1), disposition: 'cliente' };
      return next;
    });

  const submit = async () => {
    const payload: IncidentLineInput[] = lines
      .filter((l) => selected[l.id])
      .map((l) => ({
        product_id: l.product_id,
        product_code: l.product_code,
        product_name: l.product_name,
        colis_number: l.colis_number,
        quantity: selected[l.id].qty,
        disposition: selected[l.id].disposition,
      }));
    if (!subject.trim() || !description.trim()) {
      toast.error('Preencha o assunto e a descrição');
      return;
    }
    await open.mutateAsync({
      attemptId: attempt.id,
      subject: subject.trim(),
      description: description.trim(),
      lines: payload,
      attachments: files,
      opKey,
    });
    setIsOpen(false);
    setSubject('');
    setDescription('');
    setSelected({});
    setFiles([]);
    setOpKey(crypto.randomUUID());
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <LifeBuoy className="mr-2 h-4 w-4" /> Abrir assistência
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Abrir assistência</DialogTitle>
          <DialogDescription>
            Fica registada a encomenda {attempt.order_number} e enviada ao Apoio ao Cliente. Não
            altera o resultado da entrega nem cria devolução.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Assunto</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex.: móvel riscado na montagem" />
          </div>
          <div>
            <Label className="text-xs">Descrição</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Artigos afetados</Label>
            {lines.map((l) => (
              <div key={l.id} className="rounded-lg border p-2 text-sm">
                <label className="flex items-start gap-2">
                  <Checkbox checked={!!selected[l.id]} onCheckedChange={() => toggle(l)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.product_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {l.product_code} • caixa {l.colis_number}
                    </span>
                  </span>
                </label>
                {selected[l.id] && (
                  <div className="mt-2 flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      className="w-20"
                      value={selected[l.id].qty}
                      onChange={(e) =>
                        setSelected((s) => ({
                          ...s,
                          [l.id]: { ...s[l.id], qty: Math.max(1, Number(e.target.value) || 1) },
                        }))
                      }
                    />
                    <Select
                      value={selected[l.id].disposition}
                      onValueChange={(v) =>
                        setSelected((s) => ({ ...s, [l.id]: { ...s[l.id], disposition: v as Disposition } }))
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(DISPOSITION_LABELS) as Disposition[]).map((d) => (
                          <SelectItem key={d} value={d}>
                            {DISPOSITION_LABELS[d]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div>
            <Label className="text-xs">Fotos (opcional)</Label>
            <Input
              type="file"
              accept="image/*"
              multiple
              disabled={uploading || !user?.id}
              onChange={async (e) => {
                const list = Array.from(e.target.files ?? []);
                if (list.length === 0 || !user?.id) return;
                setUploading(true);
                try {
                  const uploaded = [];
                  for (const f of list) uploaded.push(await uploadIncidentAttachment(user.id, f));
                  setFiles((s) => [...s, ...uploaded]);
                } catch {
                  toast.error('Não foi possível guardar a foto');
                } finally {
                  setUploading(false);
                  e.target.value = '';
                }
              }}
            />
            {files.map((f) => (
              <p key={f.storage_reference} className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Paperclip className="h-3 w-3" /> {f.name}
                <button
                  className="ml-auto"
                  aria-label="Remover"
                  onClick={() => setFiles((s) => s.filter((x) => x.storage_reference !== f.storage_reference))}
                >
                  <X className="h-3 w-3" />
                </button>
              </p>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>
            Voltar
          </Button>
          <Button onClick={() => void submit()} disabled={open.isPending || uploading}>
            {(open.isPending || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registar assistência
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const ASSISTANCE_HELPER = { profileHint: (p?: { name?: string }) => p?.name ?? '' };
