import pathlib,json,torch
from demucs.separate import main
B=pathlib.Path(__file__).resolve().parents[1];torch.set_num_threads(4)
rows=json.loads((B/'scripts/sound-script-v1.json').read_text())['videos'];tracks=[str(B/'audio'/(r['videoId']+'.original.wav')) for r in rows if not (B/'stems/htdemucs'/(r['videoId']+'.original')/'no_vocals.wav').exists()]
main(['--two-stems','vocals','-n','htdemucs','--shifts','0','--device','cpu','-j','2','-o',str(B/'stems'),*tracks])
