# == Schema Information
#
# Table name: assemblies
#
#  id                         :integer          not null, primary key
#  genbank_assembly_accession :string(16)
#  refseq_assembly_accession  :string(16)
#  taxon_id                   :integer
#  genome_representation      :string(7)        not null
#  assembly_level             :string(20)       not null
#  assembly_name              :string(104)      not null
#  organism_name              :string(86)       not null
#  biosample                  :string(14)
#  type_strain                :binary(1)        default("b'0'"), not null
#

class Assembly < ActiveRecord::Base
  attr_readonly :id, :genbank_assembly_accession, :refseq_assembly_accession, :genome_representation, :assembly_level, :assembly_name, :organism_name, :biosample, :type_strain

  belongs_to :lineage, foreign_key: 'taxon_id', primary_key: 'taxon_id',  class_name: 'Lineage'
  has_many :assembly_sequences

  def destroy
    fail ActiveRecord::ReadOnlyRecord
  end

  def delete
    fail ActiveRecord::ReadOnlyRecord
  end

  def type_strain
    self[:type_strain] == "\x01" ? true : false
  end

  # fills in the taxon_id column
  def self.precompute_taxa
    taxa = connection.select_all("SELECT DISTINCT assembly_id, uniprot_entries.taxon_id
      FROM uniprot_entries
      INNER JOIN embl_cross_references
        ON uniprot_entry_id = uniprot_entries.id
      INNER JOIN assembly_sequences
        ON sequence_id = assembly_sequences.genbank_accession;")
    taxa = Hash[taxa.map { |t| [t['assembly_id'], t['taxon_id']] }]
    Assembly.all.find_each do |assembly|
      assembly.taxon_id = taxa[assembly.id]
      assembly.save
    end
  end

  # fills the assembly_cache table
  def self.precompute_assembly_caches
    Assembly.where('taxon_id is not null').find_each do |assembly|
      AssemblyCache.get_by_assembly_id(assembly.id)
    end
  end
end
