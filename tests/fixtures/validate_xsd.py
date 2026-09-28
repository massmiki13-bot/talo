# Valida un XML FatturaPA (letto da stdin) con lo schema ufficiale 1.2.2 dell'Agenzia delle Entrate.
# Uscita 0 se valido, altrimenti stampa gli errori.
import os
import sys
from lxml import etree

here = os.path.dirname(os.path.abspath(__file__))
schema = etree.XMLSchema(etree.parse(os.path.join(here, "fpa.xsd")))
doc = etree.fromstring(sys.stdin.buffer.read())
if schema.validate(doc):
    sys.exit(0)
for e in schema.error_log:
    print(f"riga {e.line}: {e.message}")
sys.exit(1)
