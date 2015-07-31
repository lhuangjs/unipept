# == Schema Information
#
# Table name: taxons
#
#  id          :integer          not null, primary key
#  name        :string(120)      not null
#  rank        :string(16)
#  parent_id   :integer
#  valid_taxon :binary(1)        default("b'1'"), not null
#

class Taxon < ActiveRecord::Base
  include ReadOnlyModel
  attr_accessible nil

  belongs_to :lineage, foreign_key: 'id', primary_key: 'taxon_id', class_name: 'Lineage'

  scope :with_genome, -> { uniq.joins('RIGHT JOIN uniprot_entries ON taxons.id = uniprot_entries.taxon_id') }

  # sorting order
  def <=>(other)
    return -1 if other.nil?
    id <=> other.id
  end
end
