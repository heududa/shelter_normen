#!/bin/sh
# Fügt die vom BABS in Kapiteldateien gelieferten Normen zu je einem PDF zusammen (Seiten unverändert, durchgehend gezählt).
Q=pdf/2_Technische_Weisungen
qpdf --empty --pages $Q/kapiteldateien/TWS-1982-1-Grundlagen-und-Annahmen-de.pdf $Q/kapiteldateien/tws1982srtiefgaragen-de.pdf $Q/kapiteldateien/tws1982freifeldschutzraeume-de.pdf $Q/kapiteldateien/tws1982srspitaeler-de.pdf $Q/kapiteldateien/tws1982konstruktionsregeln-de.pdf -- $Q/zusammengefuegt/TWS_1982_Kap1-5.pdf
qpdf --empty --pages $Q/kapiteldateien/TWO_1977_Kap1_Grundlagen_und_Annahmen.pdf $Q/kapiteldateien/TWO_1977_Kap2_Planung_der_Anlagen.pdf $Q/kapiteldateien/TWO_1977_Kap3_Medienplanung.pdf $Q/kapiteldateien/TWO_1977_Kap4_Bemessung_und_Konstruktion.pdf -- $Q/zusammengefuegt/TWO_1977_Kap1-4.pdf
